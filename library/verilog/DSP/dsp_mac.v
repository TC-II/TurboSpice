// Multiplicador-acumulador (#366): en cada flanco acc += a·b (F bits fraccionarios, redondeado si
// RND = 1, saturado si SAT = 1); clr en 1 lo pone en 0 en el flanco. Arranca en 0.
module dsp_mac #(parameter W = 16, parameter F = 15, parameter RND = 1, parameter SAT = 1) (
  input clk,
  input clr,
  input signed [W-1:0] a,
  input signed [W-1:0] b,
  output reg signed [W-1:0] acc
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  localparam signed [2*W-1:0] HALF = RND != 0 && F > 0 ? 1 << (F - 1) : 0;
  wire signed [2*W-1:0] p = a * b;
  wire signed [2*W-1:0] s = ((p + HALF) >>> F) + acc;
  wire ovf = s[2*W-1:W-1] != {(W+1){s[2*W-1]}};
  initial acc = 0;
  always @(posedge clk) acc <= clr ? 0 : SAT != 0 && ovf ? (s[2*W-1] ? MIN : MAX) : s[W-1:0];
endmodule
