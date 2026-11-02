// Diferenciador (#366): y[n] = x[n] − x[n−1], con el x[n−1] que guarda en cada flanco (el peine de
// un CIC). Con SAT = 0 envuelve.
module dsp_diff #(parameter W = 16, parameter SAT = 0) (
  input clk,
  input signed [W-1:0] x,
  output signed [W-1:0] y
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  reg signed [W-1:0] x1;
  initial x1 = 0;
  always @(posedge clk) x1 <= x;
  wire signed [W:0] s = x - x1;
  assign y = SAT != 0 && s[W] != s[W-1] ? (s[W] ? MIN : MAX) : s[W-1:0];
endmodule
