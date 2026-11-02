// Divisor de reloj (#366): clko sube una vez cada N flancos de clk (ciclo de trabajo ~50 %).
module dsp_clkdiv #(parameter N = 8) (
  input clk,
  output reg clko
);
  reg [15:0] n;
  initial n = 0;
  initial clko = 0;
  always @(posedge clk) begin
    n <= n == N - 1 ? 0 : n + 1;
    clko <= n < N / 2;
  end
endmodule
