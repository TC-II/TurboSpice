// Divisor en punto fijo (#366): y = a / b con F bits fraccionarios (Q1.15: F = 15, así 0,25 / 0,5
// = 0,5), truncado hacia 0 y saturado si SAT = 1. Con b = 0 da el máximo con el signo de a.
module dsp_div #(parameter W = 16, parameter F = 15, parameter SAT = 1) (
  input signed [W-1:0] a,
  input signed [W-1:0] b,
  output signed [W-1:0] y
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  wire signed [2*W-1:0] n = a <<< F;
  wire signed [2*W-1:0] d = b;
  wire signed [2*W-1:0] q = n / (b == 0 ? 1 : d);
  wire ovf = q[2*W-1:W-1] != {(W+1){q[2*W-1]}};
  assign y = b == 0 ? (a[W-1] ? MIN : MAX) : SAT != 0 && ovf ? (q[2*W-1] ? MIN : MAX) : q[W-1:0];
endmodule
