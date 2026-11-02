// Inversión del orden de los bits (#366): el bit 0 pasa a ser el W−1 (como en el reordenamiento de una FFT).
module dsp_bitrev #(parameter W = 16) (
  input [W-1:0] x,
  output [W-1:0] y
);
  genvar k;
  generate
    for (k = 0; k < W; k = k + 1) begin : rev
      assign y[k] = x[W-1-k];
    end
  endgenerate
endmodule
