// Prueba de OSDI en WebAssembly (#209): un resistor "vres(p, n)" escrito a mano contra la ABI OSDI
// 0.3 de ngspice (src/osdi/osdi.h), lo mismo que generaría OpenVAF para
//   module vres(p, n); inout p, n; electrical p, n; parameter real r = 1k;
//   analog I(p, n) <+ V(p, n) / r; endmodule
// Sirve para probar el lado de ngspice (dlopen de un side module, pre_osdi, la ABI en wasm32)
// sin depender de que OpenVAF genere wasm32.
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "osdi.h"

#define NONE UINT32_MAX

typedef struct {
  uint32_t node_mapping[2];
  bool collapsed[1];
  double *jacobian_ptr_resist[4];
  uint32_t state_idx[1];
  double residual[2];
  double g;
} Inst;

typedef struct {
  double r;
  bool r_given;
} Model;

static char *r_names[] = {"r"};
static OsdiParamOpvar params[] = {
    {.name = r_names, .num_alias = 0, .description = "resistance", .units = "Ohm", .flags = PARA_TY_REAL | PARA_KIND_MODEL, .len = 0},
};

static OsdiNode nodes[] = {
    {.name = "p", .units = "V", .residual_units = "A", .resist_residual_off = offsetof(Inst, residual[0]), .react_residual_off = NONE, .resist_limit_rhs_off = NONE, .react_limit_rhs_off = NONE, .is_flow = false},
    {.name = "n", .units = "V", .residual_units = "A", .resist_residual_off = offsetof(Inst, residual[1]), .react_residual_off = NONE, .resist_limit_rhs_off = NONE, .react_limit_rhs_off = NONE, .is_flow = false},
};

static OsdiJacobianEntry jacobian[] = {
    {.nodes = {0, 0}, .react_ptr_off = NONE, .flags = JACOBIAN_ENTRY_RESIST},
    {.nodes = {0, 1}, .react_ptr_off = NONE, .flags = JACOBIAN_ENTRY_RESIST},
    {.nodes = {1, 0}, .react_ptr_off = NONE, .flags = JACOBIAN_ENTRY_RESIST},
    {.nodes = {1, 1}, .react_ptr_off = NONE, .flags = JACOBIAN_ENTRY_RESIST},
};

static void *access(void *inst, void *model, uint32_t id, uint32_t flags) {
  (void)inst;
  Model *m = model;
  if (id != 0 || (flags & ACCESS_FLAG_INSTANCE)) return NULL;
  if (flags & ACCESS_FLAG_SET) m->r_given = true;
  return &m->r;
}

static void setup_model(void *handle, void *model, OsdiSimParas *sim, OsdiInitInfo *res) {
  (void)handle, (void)sim;
  Model *m = model;
  if (!m->r_given) m->r = 1e3;
  *res = (OsdiInitInfo){0, 0, NULL};
}

static void setup_instance(void *handle, void *inst, void *model, double temp, uint32_t nterm, OsdiSimParas *sim, OsdiInitInfo *res) {
  (void)handle, (void)inst, (void)model, (void)temp, (void)nterm, (void)sim;
  *res = (OsdiInitInfo){0, 0, NULL};
}

static uint32_t eval(void *handle, void *inst, const void *model, const OsdiSimInfo *info) {
  (void)handle;
  Inst *in = inst;
  const Model *m = model;
  double v = info->prev_solve[in->node_mapping[0]] - info->prev_solve[in->node_mapping[1]];
  in->g = 1.0 / m->r;
  in->residual[0] = v * in->g;
  in->residual[1] = -v * in->g;
  return 0;
}

static void load_residual_resist(void *inst, void *model, double *dst) {
  (void)model;
  Inst *in = inst;
  dst[in->node_mapping[0]] += in->residual[0];
  dst[in->node_mapping[1]] += in->residual[1];
}

static void load_jacobian_resist(void *inst, void *model) {
  (void)model;
  Inst *in = inst;
  *in->jacobian_ptr_resist[0] += in->g;
  *in->jacobian_ptr_resist[1] -= in->g;
  *in->jacobian_ptr_resist[2] -= in->g;
  *in->jacobian_ptr_resist[3] += in->g;
}

static void load_jacobian_react(void *inst, void *model, double alpha) { (void)inst, (void)model, (void)alpha; }
static void load_jacobian_tran(void *inst, void *model, double alpha) { (void)alpha, load_jacobian_resist(inst, model); }

// RHS de SPICE: −residuo + J·V (lineal: da 0)
static void load_spice_rhs_dc(void *inst, void *model, double *dst, double *prev) {
  (void)model;
  Inst *in = inst;
  double v = prev[in->node_mapping[0]] - prev[in->node_mapping[1]];
  dst[in->node_mapping[0]] += -in->residual[0] + in->g * v;
  dst[in->node_mapping[1]] += -in->residual[1] - in->g * v;
}

static void load_spice_rhs_tran(void *inst, void *model, double *dst, double *prev, double alpha) { (void)alpha, load_spice_rhs_dc(inst, model, dst, prev); }

const uint32_t OSDI_VERSION_MAJOR = 0;
const uint32_t OSDI_VERSION_MINOR = 3;
const uint32_t OSDI_NUM_DESCRIPTORS = 1;
// ngspice escribe acá su función de log al cargar el módulo
void (*osdi_log)(void *handle, char *msg, uint32_t lvl) = NULL;

const OsdiDescriptor OSDI_DESCRIPTORS[1] = {{
    .name = "vres",
    .num_nodes = 2,
    .num_terminals = 2,
    .nodes = nodes,
    .num_jacobian_entries = 4,
    .jacobian_entries = jacobian,
    .num_collapsible = 0,
    .collapsible = NULL,
    .collapsed_offset = offsetof(Inst, collapsed),
    .noise_sources = NULL,
    .num_noise_src = 0,
    .num_params = 1,
    .num_instance_params = 0,
    .num_opvars = 0,
    .param_opvar = params,
    .node_mapping_offset = offsetof(Inst, node_mapping),
    .jacobian_ptr_resist_offset = offsetof(Inst, jacobian_ptr_resist),
    .num_states = 0,
    .state_idx_off = offsetof(Inst, state_idx),
    .bound_step_offset = NONE,
    .instance_size = sizeof(Inst),
    .model_size = sizeof(Model),
    .access = access,
    .setup_model = setup_model,
    .setup_instance = setup_instance,
    .eval = eval,
    .load_noise = NULL,
    .load_residual_resist = load_residual_resist,
    .load_residual_react = NULL,
    .load_limit_rhs_resist = NULL,
    .load_limit_rhs_react = NULL,
    .load_spice_rhs_dc = load_spice_rhs_dc,
    .load_spice_rhs_tran = load_spice_rhs_tran,
    .load_jacobian_resist = load_jacobian_resist,
    .load_jacobian_react = load_jacobian_react,
    .load_jacobian_tran = load_jacobian_tran,
}};
