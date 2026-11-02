// Valor absoluto (#366): |x|; con SAT = 1, |−2^(W−1)| da el máximo en vez de envolver.
module dsp_abs #(parameter W = 16, parameter SAT = 1) (
  input signed [W-1:0] x,
  output signed [W-1:0] y
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  assign y = x[W-1] ? (SAT != 0 && x == MIN ? MAX : -x) : x;
endmodule
