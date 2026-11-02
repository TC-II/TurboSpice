// Tap (#366): y = COEF·x con F bits fraccionarios. COEF es el entero del coeficiente
// (Q1.15: 0,25 es 8192); cada instancia puede tener el suyo.
module dsp_tap #(parameter W = 16, parameter F = 15, parameter COEF = 16384, parameter RND = 1, parameter SAT = 1) (
  input signed [W-1:0] x,
  output signed [W-1:0] y
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  localparam signed [W-1:0] C = COEF;
  localparam signed [2*W-1:0] HALF = RND != 0 && F > 0 ? 1 << (F - 1) : 0;
  wire signed [2*W-1:0] p = x * C;
  wire signed [2*W-1:0] q = (p + HALF) >>> F;
  wire ovf = q[2*W-1:W-1] != {(W+1){q[2*W-1]}};
  assign y = SAT != 0 && ovf ? (q[2*W-1] ? MIN : MAX) : q[W-1:0];
endmodule
