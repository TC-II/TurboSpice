// Binario → Gray (#366): dos valores seguidos difieren en un solo bit.
module dsp_bin2gray #(parameter W = 16) (
  input [W-1:0] x,
  output [W-1:0] y
);
  assign y = x ^ (x >> 1);
endmodule
