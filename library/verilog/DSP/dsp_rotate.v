// Rotación (#366): K bits a la izquierda (los que salen por arriba entran por abajo); 0 ≤ K < W.
module dsp_rotate #(parameter W = 16, parameter K = 1) (
  input [W-1:0] x,
  output [W-1:0] y
);
  localparam integer R = K % W;
  assign y = R == 0 ? x : {x[W-1-R:0], x[W-1:W-R]};
endmodule
