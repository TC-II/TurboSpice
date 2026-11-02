// Cantidad de unos (#366) de una palabra.
module dsp_popcount #(parameter W = 16) (
  input [W-1:0] x,
  output reg [4:0] n
);
  integer k;
  always @* begin
    n = 0;
    for (k = 0; k < W; k = k + 1) n = n + x[k];
  end
endmodule
