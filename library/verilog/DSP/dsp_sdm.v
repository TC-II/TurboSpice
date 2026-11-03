// Modulador sigma-delta digital de primer orden (#366): de x (Q1.15) a un bit q por ciclo cuyo
// promedio es x (q = 1 vale +1, q = 0 vale −1). Para un DAC de 1 bit con un filtro RC afuera.
module dsp_sdm #(parameter W = 16) (
  input clk,
  input signed [W-1:0] x,
  output q
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  reg signed [W+1:0] acc;
  initial acc = 0;
  assign q = !acc[W+1];
  always @(posedge clk) acc <= acc + x - (q ? MAX : MIN);
endmodule
