// Ceros a la izquierda (#366): cuántos bits en 0 hay antes del primer 1 (W si x = 0). Para normalizar.
module dsp_clz #(parameter W = 16) (
  input [W-1:0] x,
  output reg [4:0] n
);
  integer k;
  reg found;
  always @* begin
    n = 0;
    found = 0;
    for (k = W - 1; k >= 0; k = k - 1) begin
      if (x[k]) found = 1;
      if (!found) n = n + 1;
    end
  end
endmodule
