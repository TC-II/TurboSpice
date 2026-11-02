// LFSR de 16 bits (#366): secuencia pseudoaleatoria de longitud máxima (2^16 − 1), polinomio
// x^16 + x^14 + x^13 + x^11 + 1 (Fibonacci). q es el estado (como palabra, ruido blanco uniforme)
// y prbs, el bit que sale. SEED es el estado inicial (no puede ser 0).
module dsp_lfsr #(parameter SEED = 44257) (
  input clk,
  output reg [15:0] q,
  output prbs
);
  initial q = SEED;
  wire fb = q[15] ^ q[13] ^ q[12] ^ q[10];
  always @(posedge clk) q <= {q[14:0], fb};
  assign prbs = q[15];
endmodule
