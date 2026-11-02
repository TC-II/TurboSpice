// Promedio móvil de 2^K muestras (#366): la suma de las últimas 2^K (con un acumulador y una línea
// de retardos de 2^K) dividida por 2^K. Ganancia 1 en continua; K de 1 a 5.
module dsp_movavg #(parameter W = 16, parameter K = 3) (
  input clk,
  input signed [W-1:0] x,
  output signed [W-1:0] y
);
  localparam integer N = 1 << K;
  reg signed [W-1:0] line [0:N-1];
  reg signed [W+K-1:0] acc;
  integer k;
  initial begin
    for (k = 0; k < N; k = k + 1) line[k] = 0;
    acc = 0;
  end
  always @(posedge clk) begin
    acc <= acc + x - line[N-1];
    for (k = N - 1; k > 0; k = k - 1) line[k] <= line[k-1];
    line[0] <= x;
  end
  assign y = acc >>> K;
endmodule
