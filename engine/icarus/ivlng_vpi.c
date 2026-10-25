/*
 * ivlng.vpi: módulo VPI que sincroniza la simulación de Icarus Verilog con ngspice, sin hilos
 * (TurboSpice #209). Basado en vpi.c de ngspice-47 (Copyright (c) 2002 Stephen Williams,
 * (c) 2023 Giles Atkinson; GPL 2 o posterior); ver ivlng_st.h.
 *
 * En el original, next_advance_cb() cedía el control a ngspice (corrutina) y al volver aplicaba
 * las entradas y programaba el próximo alto. Acá pide una pausa al planificador de VVP
 * (vvp_request_yield) y lo que seguía es resume(), que llama el puente en el próximo step().
 */
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <math.h>
#include <stdint.h>
#include "vpi_user.h"

#include "ngspice/cmtypes.h"
#include "ngspice/cosim.h"

#include "ivlng_st.h"

/* de libvvp (parcheado): pausar el planificador después del evento actual */
extern void vvp_request_yield(void);

static PLI_INT32 next_advance_cb(struct t_cb_data *cb);

static double get_time(struct ng_vvp *ctx)
{
    static struct t_vpi_time now = { .type = vpiSimTime };
    uint64_t                 ticks;

    vpi_get_time(NULL, &now);
    ticks = ((uint64_t)now.high << 32) + now.low;
    return (double)ticks * ctx->tick_length;
}

/* Programa next_advance_cb() dentro de `length` ticks (0: al final de este paso). */
static vpiHandle set_stop(uint64_t length, struct ng_vvp *ctx)
{
    static struct t_vpi_time now = { .type = vpiSimTime };
    static struct t_cb_data  cbd = { .cb_rtn = next_advance_cb, .time = &now };

    now.low = (unsigned int)length;
    now.high = (unsigned int)(length >> 32);
    cbd.reason = length == 0 ? cbReadWriteSynch : cbAfterDelay;
    cbd.user_data = (PLI_BYTE8 *)ctx;
    return vpi_register_cb(&cbd);
}

/* Fin de un avance: VVP queda esperando a ngspice. */
static PLI_INT32 next_advance_cb(struct t_cb_data *cb)
{
    struct ng_vvp *ctx = (struct ng_vvp *)cb->user_data;

    if (ctx->stop) {
        vpi_control(vpiFinish, 0);
        return 0;
    }
    ctx->base_time = ctx->cosim_context->vtime;
    ctx->waiting = 1;
    if (ctx->in_loop)
        vvp_request_yield();
    return 0;
}

/*
 * Lo que hacía next_advance_cb() al volver de ngspice: aplicar las entradas y programar el próximo
 * alto en el tiempo de SPICE (vtime). Devuelve 1 si VVP tiene que correr, 0 si sigue esperando
 * (todavía no puede avanzar ni un tick).
 */
static int resume(struct ng_vvp *ctx)
{
    struct t_vpi_value val;
    double             vl_time;
    uint64_t           ticks;
    unsigned int       i;

    ctx->waiting = 0;
    if (ctx->stop) {
        vpi_control(vpiFinish, 0);
        return 1;
    }

    val.format = vpiVectorVal;
    i = ctx->ins ? 0 : ctx->outs;
    while (ctx->in_pending) {
        if (ctx->ports[i].flags & IN_PENDING) {
            ctx->ports[i].flags ^= IN_PENDING;
            val.value.vector = (struct t_vpi_vecval *)&ctx->ports[i].previous;
            vpi_put_value(ctx->ports[i].handle, &val, NULL, vpiNoDelay);
            ctx->in_pending--;
        } else if (++i == ctx->ins) {
            i = ctx->ins + ctx->outs; // los inout
        }
    }

    vl_time = get_time(ctx);
    if (ctx->cosim_context->vtime < vl_time) {
        if (ctx->cosim_context->vtime + ctx->tick_length < vl_time)
            fprintf(stderr, "Error: time reversal (%.10g->%.10g) in Icarus Shim VPI!\n", vl_time, ctx->cosim_context->vtime);
    } else {
        ticks = (uint64_t)((ctx->cosim_context->vtime - vl_time) / ctx->tick_length);
        if (ticks > 0) {
            ctx->stop_cb = set_stop(ticks, ctx);
            return 1;
        }
    }
    /* todavía no: sigue esperando */
    ctx->base_time = ctx->cosim_context->vtime;
    ctx->waiting = 1;
    return 0;
}

/* Una salida cambió (igual que el original). */
static PLI_INT32 output_cb(struct t_cb_data *cb)
{
    struct ngvp_port *pp = (struct ngvp_port *)cb->user_data;
    struct ng_vvp    *ctx = pp->ctx;

    if (ctx->stop_cb) {
        /* primera en este paso de VVP: parar al final del paso para juntar todas las salidas */
        vpi_remove_cb(ctx->stop_cb);
        ctx->stop_cb = NULL;
        set_stop(0, ctx);
        ctx->cosim_context->vtime = get_time(ctx);
        if (ctx->cosim_context->vtime < ctx->base_time)
            ctx->cosim_context->vtime = ctx->base_time;
    }
    pp->new.aval = cb->value->value.vector->aval;
    pp->new.bval = cb->value->value.vector->bval;
    if (!(pp->flags & OUT_PENDING)) {
        pp->flags |= OUT_PENDING;
        ++ctx->out_pending;
    }
    return 0;
}

static void init(vpiHandle handle)
{
    static struct t_vpi_value val = { .format = vpiIntVal };

    vpi_put_value(handle, &val, NULL, vpiNoDelay);
}

static void watch(vpiHandle handle, void *pp)
{
    static struct t_vpi_time  time = { .type = vpiSuppressTime };
    static struct t_vpi_value val = { .format = vpiVectorVal };
    static struct t_cb_data   cb = { .reason = cbValueChange, .cb_rtn = output_cb, .time = &time, .value = &val };

    cb.obj = handle;
    cb.user_data = pp;
    vpi_register_cb(&cb);
}

/* Arranca la simulación: los puertos del módulo de más arriba (igual que el original). */
static PLI_INT32 start_cb(struct t_cb_data *cb)
{
    struct ng_vvp *ctx = (struct ng_vvp *)cb->user_data;
    vpiHandle      iter, top, item;
    PLI_INT32      direction;
    char          *name;
    int            ii, oi, ioi;

    ctx->tick_length = pow(10.0, vpi_get(vpiTimeUnit, NULL));

    iter = vpi_iterate(vpiModule, NULL);
    top = vpi_scan(iter);
    vpi_free_object(iter);

    iter = vpi_iterate(vpiPort, top);
    if (!iter) {
        vpi_printf("Top module has no ports!\n");
        return 0;
    }
    ctx->ins = ctx->outs = ctx->inouts = 0;
    while ((item = vpi_scan(iter))) {
        direction = vpi_get(vpiDirection, item);
        if (direction == vpiInput)
            ++ctx->ins;
        else if (direction == vpiOutput)
            ++ctx->outs;
        else if (direction == vpiInout)
            ++ctx->inouts;
    }
    ctx->ports = (struct ngvp_port *)calloc(ctx->ins + ctx->outs + ctx->inouts + 1, sizeof (struct ngvp_port));
    if (!ctx->ports) {
        vpi_printf("No memory for ports\n");
        abort();
    }

    iter = vpi_iterate(vpiPort, top);
    ii = oi = ioi = 0;
    while ((item = vpi_scan(iter))) {
        vpiHandle         namesake;
        struct ngvp_port *pp;
        int               first;

        direction = vpi_get(vpiDirection, item);
        name = vpi_get_str(vpiName, item);
        /* hay un objeto con el nombre del puerto cuyo valor se lee y se cambia */
        namesake = vpi_handle_by_name(name, top);
        switch (direction) {
        case vpiInput:
            first = !ii;
            pp = ctx->ports + ii++;
            init(namesake);
            break;
        case vpiOutput:
            first = !oi;
            pp = ctx->ports + ctx->ins + oi++;
            watch(namesake, pp);
            break;
        case vpiInout:
            first = !ioi;
            init(namesake);
            pp = ctx->ports + ctx->ins + ctx->outs + ioi++;
            watch(namesake, pp);
            break;
        default:
            continue;
        }
        pp->bits = (uint16_t)vpi_get(vpiSize, item);
        pp->flags = 0;
        pp->position = first ? 0 : pp[-1].position + pp[-1].bits;
        pp->previous.aval = pp->previous.bval = 0;
        pp->handle = namesake;
        pp->ctx = ctx;
    }

    /* queda esperando a ngspice (todavía fuera del planificador: no hace falta pedir pausa) */
    ctx->resume = resume;
    cb->user_data = (PLI_BYTE8 *)ctx;
    next_advance_cb(cb);
    return 0;
}

static void start(void)
{
    static struct t_vpi_time now = { .type = vpiSimTime };
    static struct t_cb_data  cbd = { .reason = cbStartOfSimulation, .time = &now, .cb_rtn = start_cb };

    cbd.user_data = (PLI_BYTE8 *)Get_ng_vvp();
    vpi_register_cb(&cbd);
}

void (*vlog_startup_routines[])(void) = {
    start,
    0
};
