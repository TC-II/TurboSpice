// Recuantizador (#366): cambia la cantidad de bits fraccionarios. y = x · 2^−SHIFT (SHIFT > 0
// descarta bits de abajo, redondeando si RND = 1; SHIFT < 0 los agrega y puede desbordar), saturado
// si SAT = 1. Sirve para pasar de un formato a otro (Q2.14 → Q1.15 con SHIFT = −1…).
module dsp_requant #(parameter W = 16, parameter SHIFT = 1, parameter RND = 1, parameter SAT = 1) (
  input signed [W-1:0] x,
  output signed [W-1:0] y
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  localparam integer S = SHIFT < 0 ? -SHIFT : SHIFT;
  // (con 2W bits entran el corrimiento a la izquierda y el redondeo sin desbordar)
  wire signed [2*W-1:0] xe = x;
  wire signed [2*W-1:0] r = SHIFT > 0 ? (xe + (RND != 0 ? 1 << (S - 1) : 0)) >>> S : xe <<< S;
  wire ovf = r[2*W-1:W-1] != {(W+1){r[2*W-1]}};
  assign y = SAT != 0 && ovf ? (r[2*W-1] ? MIN : MAX) : r[W-1:0];
endmodule
