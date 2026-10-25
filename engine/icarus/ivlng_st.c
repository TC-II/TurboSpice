/*
 * ivlng: biblioteca que carga el code model d_cosim de ngspice para co-simular con Icarus Verilog
 * (libvvp), sin hilos (TurboSpice #209). Basado en icarus_shim.c de ngspice-47
 * (Copyright (c) 2024-2025 Giles Atkinson, misma licencia que ngspice); ver ivlng_st.h.
 */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <dlfcn.h>

#include "ngspice/cmtypes.h" // Digital_t
#include "ngspice/cosim.h"

#include "ivlng_st.h"

#ifndef NGSPICELIBDIR
#define NGSPICELIBDIR "/usr/local/lib/ngspice"
#endif

struct vvp_fns {
    void (*add_module_path)(const char *path);
    void (*init)(const char *logfile_name, int argc, char *argv[]);
    void (*no_signals)(void);
    void (*load_module)(const char *name);
    int  (*run_begin)(const char *design_path);
    int  (*run_resume)(void);
    int  (*run_end)(void);
};
static const char *const fn_names[] = {
    "vpip_add_module_path", "vvp_init", "vvp_no_signals", "vpip_load_module",
    "vvp_run_begin", "vvp_run_resume", "vvp_run_end", 0
};

/* Entrada de ngspice a un puerto de entrada o inout (igual que el original). */
static void input(struct co_info *pinfo, unsigned int bit, Digital_t *val)
{
    struct ng_vvp    *ctx = (struct ng_vvp *)pinfo->handle;
    struct ngvp_port *pp;
    unsigned int      count;
    int               a, b, dirty;

    if (val->strength <= HI_IMPEDANCE && val->state != UNKNOWN) {
        a = val->state;     // '0' / '1'
        b = 0;
    } else if (val->strength == HI_IMPEDANCE) {
        a = 0;              // 'z'
        b = 1;
    } else {
        a = 1;              // 'x'
        b = 1;
    }

    if (bit >= pinfo->in_count) {
        bit -= pinfo->in_count;
        if (bit >= pinfo->inout_count)
            return;
        pp = ctx->ports + ctx->ins + ctx->outs;
        count = ctx->inouts;
    } else {
        pp = ctx->ports;
        count = ctx->ins;
    }
    while (count--) {
        if (pp[count].position <= bit)
            break;
    }
    pp = pp + count;
    bit -= pp->position;

    dirty = 0;
    bit = pp->bits - bit - 1; // big-endian
    a <<= bit;
    if (a ^ pp->previous.aval) {
        if (a)
            pp->previous.aval |= a;
        else
            pp->previous.aval &= ~(1 << bit);
        dirty = 1;
    }
    b <<= bit;
    if (b ^ pp->previous.bval) {
        if (b)
            pp->previous.bval |= b;
        else
            pp->previous.bval &= ~(1 << bit);
        dirty = 1;
    }
    if (dirty && !(pp->flags & IN_PENDING)) {
        pp->flags |= IN_PENDING;
        ++ctx->in_pending;
    }
}

/* Corre VVP hasta la próxima pausa (o hasta que termina). */
static void run(struct ng_vvp *ctx)
{
    if (ctx->finished)
        return;
    if (!ctx->run_resume()) {
        ctx->finished = 1;
        ctx->waiting = 0;
        ctx->run_end();
    }
}

/* Le pasa a ngspice las salidas que cambiaron (igual que el original). */
static void report(struct co_info *pinfo)
{
    struct ng_vvp *ctx = (struct ng_vvp *)pinfo->handle;
    struct ngvp_port *pp;
    uint32_t          changed, mask, limit, i, bit;

    if (!ctx->out_pending)
        return;
    limit = ctx->outs + ctx->inouts;
    for (i = 0, pp = ctx->ports + ctx->ins; i < limit; ++i, ++pp) {
        if (!(pp->flags & OUT_PENDING))
            continue;
        pp->flags &= (uint16_t)~OUT_PENDING;
        changed = (uint32_t)((pp->new.aval ^ pp->previous.aval) |
                             (pp->new.bval ^ pp->previous.bval));
        if (changed) {
            bit = pp->position;
            mask = 1 << (pp->bits - 1);
            while (changed) {
                if (mask & changed) {
                    static const Digital_t lv_vals[] =
                        { {ZERO, STRONG}, {ONE, STRONG},
                          {ZERO, HI_IMPEDANCE}, {UNKNOWN, STRONG} };
                    uint32_t a, b;

                    a = ((uint32_t)pp->new.aval & mask) != 0;
                    b = ((uint32_t)pp->new.bval & mask) != 0;
                    a += (b << 1);
                    pinfo->out_fn(pinfo, bit, (Digital_t *)lv_vals + a);
                    changed &= ~mask;
                }
                mask >>= 1;
                ++bit;
            }
            pp->previous.aval = pp->new.aval;
            pp->previous.bval = pp->new.bval;
        }
        if (--ctx->out_pending == 0)
            break;
    }
    ctx->out_pending = 0;
}

/* ngspice avanza: VVP sigue hasta alcanzar pinfo->vtime o hasta producir una salida. */
static void step(struct co_info *pinfo)
{
    struct ng_vvp *ctx = (struct ng_vvp *)pinfo->handle;

    if (!ctx->finished && ctx->waiting && ctx->resume(ctx))
        run(ctx);
    report(pinfo);
}

static void cleanup(struct co_info *pinfo)
{
    struct ng_vvp *ctx = (struct ng_vvp *)pinfo->handle;

    if (!ctx)
        return;
    /* que VVP termine ($finish) y ejecute sus bloques final */
    ctx->stop = 1;
    if (!ctx->finished && ctx->waiting && ctx->resume(ctx))
        run(ctx);
    free(ctx->ports);
    dlclose(ctx->vvp_handle);
    free(ctx);
    pinfo->handle = NULL;
}

/* El módulo VPI (ivlng.vpi) toma el contexto de acá al arrancar la simulación. */
static struct ng_vvp *context;

struct ng_vvp *Get_ng_vvp(void)
{
    return context;
}

/* Lo llama d_cosim al crear la instancia. */
__attribute__((visibility("default")))
void Cosim_setup(struct co_info *pinfo)
{
    struct vvp_fns    fns;
    void            **fpptr;
    const char       *file;
    struct ngvp_port *last_port;
    int               i;

    context = calloc(1, sizeof (struct ng_vvp));
    if (!context) {
        fprintf(stderr, "Icarus shim: out of memory\n");
        abort();
    }
    context->cosim_context = pinfo;
    pinfo->handle = context;

    file = (pinfo->lib_argc > 0 && pinfo->lib_argv[0][0]) ? pinfo->lib_argv[0] : "libvvp";
    context->vvp_handle = pinfo->dlopen_fn(file);
    if (!context->vvp_handle) {
        fprintf(stderr, "Icarus shim failed to load VVP library\n");
        abort();
    }
    fpptr = (void **)&fns;
    for (i = 0; fn_names[i]; ++i, ++fpptr) {
        *fpptr = dlsym(context->vvp_handle, fn_names[i]);
        if (!*fpptr) {
            fprintf(stderr, "Icarus shim failed to find VVP function %s (a libvvp with vvp_run_begin is needed)\n", fn_names[i]);
            abort();
        }
    }
    context->run_resume = fns.run_resume;
    context->run_end = fns.run_end;

    fns.add_module_path(".");
    fns.init((pinfo->lib_argc >= 3) ? pinfo->lib_argv[2] : NULL, (int)pinfo->sim_argc, (char **)pinfo->sim_argv);
    fns.no_signals();
    file = (pinfo->lib_argc >= 2 && pinfo->lib_argv[1][0]) ? pinfo->lib_argv[1] : NGSPICELIBDIR "/ivlng";
    fns.load_module(file);

    /* Compila el .vvp y arranca: el módulo VPI encuentra los puertos y queda esperando a ngspice. */
    if (fns.run_begin(pinfo->sim_argv[0])) {
        fprintf(stderr, "Icarus shim: could not start the simulation of %s\n", pinfo->sim_argv[0]);
        abort();
    }
    context->in_loop = 1;
    if (!context->ports || !context->resume) {
        fprintf(stderr, "Icarus shim: the VPI module %s did not start\n", file);
        abort();
    }

    last_port = context->ports + context->ins - 1;
    pinfo->in_count = context->ins ? last_port->position + last_port->bits : 0;
    last_port += context->outs;
    pinfo->out_count = context->outs ? last_port->position + last_port->bits : 0;
    last_port += context->inouts;
    pinfo->inout_count = context->inouts ? last_port->position + last_port->bits : 0;
    pinfo->cleanup = cleanup;
    pinfo->step = step;
    pinfo->in_fn = input;
    pinfo->method = Normal;
}
