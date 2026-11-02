// Gray → binario (#366).
module dsp_gray2bin #(parameter W = 16) (
  input [W-1:0] x,
  output [W-1:0] y
);
  genvar k;
  generate
    for (k = 0; k < W; k = k + 1) begin : g
      assign y[k] = ^(x >> k);
    end
  endgenerate
endmodule
