// Antirrebote (#366): q copia d sólo después de que d se mantuvo igual N ciclos seguidos.
module dsp_debounce #(parameter N = 16) (
  input clk,
  input d,
  output reg q
);
  reg [15:0] n;
  reg d1;
  initial n = 0;
  initial q = 0;
  initial d1 = 0;
  always @(posedge clk) begin
    d1 <= d;
    if (d1 == q) n <= 0;
    else if (n == N - 1) begin
      q <= d1;
      n <= 0;
    end else n <= n + 1;
  end
endmodule
