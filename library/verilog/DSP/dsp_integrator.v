// Integrador (#366): acumula x en cada flanco (y[n] = y[n−1] + x[n]); clr lo pone en 0. Con SAT = 0
// envuelve, como los integradores de un CIC. Arranca en 0.
module dsp_integrator #(parameter W = 16, parameter SAT = 0) (
  input clk,
  input clr,
  input signed [W-1:0] x,
  output reg signed [W-1:0] y
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  wire signed [W:0] s = y + x;
  initial y = 0;
  always @(posedge clk) y <= clr ? 0 : SAT != 0 && s[W] != s[W-1] ? (s[W] ? MIN : MAX) : s[W-1:0];
endmodule
