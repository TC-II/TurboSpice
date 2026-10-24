/*
 * Puente d_cosim ↔ Icarus Verilog (libvvp) sin hilos, para ngspice en WebAssembly (TurboSpice #209).
 * Basado en icarus_shim.h de ngspice-47 (Giles Atkinson, misma licencia que ngspice).
 *
 * El original corre libvvp en otro hilo (pthreads) y alterna con ngspice como corrutina. En el
 * navegador no hay hilos (GitHub Pages no permite aislar el origen), así que libvvp va parcheado
 * para correr por partes (vvp_run_begin / vvp_run_resume / vvp_run_end, vvp_request_yield): el
 * callback que en el original cedía el control pide una pausa y la próxima llamada de ngspice
 * sigue desde ahí.
 */
#ifndef IVLNG_ST_H
#define IVLNG_ST_H

#include <stdint.h>

struct ngvp_port {
    uint16_t            bits;           // cantidad de bits
    uint16_t            flags;          // entrada / salida pendiente
    uint32_t            position;       // bits antes que este puerto
    struct {                            // como struct t_vpi_vecval
        int32_t           aval;
        int32_t           bval;
    }                   previous, new;
    struct __vpiHandle *handle;         // la variable del puerto
    struct ng_vvp      *ctx;
};

#define IN_PENDING  1
#define OUT_PENDING 2

struct ng_vvp {
    int                 stop;           // ngspice terminó: hay que cerrar VVP
    int                 waiting;        // VVP está pausado esperando a ngspice
    int                 in_loop;        // ya corre el planificador (una pausa se puede pedir)
    int                 finished;       // VVP terminó ($finish o sin eventos)
    struct co_info     *cosim_context;
    uint32_t            ins;            // puertos por tipo
    uint32_t            outs;
    uint32_t            inouts;
    double              base_time;      // tiempo de SPICE al pausar
    double              tick_length;    // unidad de tiempo de VVP
    struct __vpiHandle *stop_cb;        // callback de fin de avance
    uint32_t            in_pending;     // puertos cambiados
    uint32_t            out_pending;
    struct ngvp_port   *ports;
    void               *vvp_handle;     // dlopen() de libvvp
    /* del módulo VPI: lo que hacía el callback después de ceder el control; 1 = VVP puede correr */
    int               (*resume)(struct ng_vvp *ctx);
    /* de libvvp */
    int               (*run_resume)(void);
    int               (*run_end)(void);
};

struct ng_vvp *Get_ng_vvp(void);

#endif
