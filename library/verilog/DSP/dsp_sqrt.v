// Raíz cuadrada en punto fijo (#366): y = √x con F bits fraccionarios en la entrada y la salida
// (Q1.15: √0,25 = 0,5), redondeada hacia abajo bit por bit. Una x negativa da 0.
module dsp_sqrt #(parameter W = 16, parameter F = 15) (
  input signed [W-1:0] x,
  output reg signed [W-1:0] y
);
  reg [2*W-1:0] r;
  reg [2*W-1:0] t;
  integer k;
  always @* begin
    y = 0;
    r = x[W-1] ? 0 : x;
    r = r << F;
    for (k = W - 2; k >= 0; k = k - 1) begin
      t = y | (1 << k);
      if (t * t <= r) y = y | (1 << k);
    end
  end
endmodule
