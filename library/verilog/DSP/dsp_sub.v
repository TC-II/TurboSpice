// Restador en complemento a dos (#366). SAT = 1 satura en el desborde; SAT = 0 envuelve.
module dsp_sub #(parameter W = 16, parameter SAT = 1) (
  input signed [W-1:0] a,
  input signed [W-1:0] b,
  output signed [W-1:0] y
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  wire signed [W:0] s = a - b;
  assign y = SAT != 0 && s[W] != s[W-1] ? (s[W] ? MIN : MAX) : s[W-1:0];
endmodule
