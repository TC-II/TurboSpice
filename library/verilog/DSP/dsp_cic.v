// CIC diezmador (#366) en un solo bloque: N etapas (1 a 4), ↓R, con los integradores a la frecuencia
// de clk y los peines una vez cada R ciclos, con N·log2(R) bits de más adentro (aritmética que
// envuelve) y la salida dividida por R^N (ganancia 1 en continua; R potencia de 2). y cambia cada R
// ciclos y valid vale 1 en el ciclo en que cambia.
module dsp_cic #(parameter W = 16, parameter R = 8, parameter N = 2) (
  input clk,
  input signed [W-1:0] x,
  output reg signed [W-1:0] y,
  output reg valid
);
  localparam integer G = N * $clog2(R);
  localparam integer WI = W + G;
  reg signed [WI-1:0] i1, i2, i3, i4, c0, c1, c2, c3, c4, d1, d2, d3, d4;
  reg [15:0] n;
  initial begin
    {i1, i2, i3, i4, d1, d2, d3, d4} = 0;
    n = 0;
    y = 0;
    valid = 0;
  end
  always @* begin
    c0 = N == 1 ? i1 : N == 2 ? i2 : N == 3 ? i3 : i4;
    c1 = c0 - d1;
    c2 = c1 - d2;
    c3 = c2 - d3;
    c4 = c3 - d4;
  end
  always @(posedge clk) begin
    i1 <= i1 + x;
    i2 <= i2 + i1;
    i3 <= i3 + i2;
    i4 <= i4 + i3;
    n <= n == R - 1 ? 0 : n + 1;
    valid <= n == R - 1;
    if (n == R - 1) begin
      {d1, d2, d3, d4} <= {c0, c1, c2, c3};
      y <= (N == 1 ? c1 : N == 2 ? c2 : N == 3 ? c3 : c4) >>> G;
    end
  end
endmodule
