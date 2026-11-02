// Diezmador ↓M (#366): clko es el reloj de la salida (f_reloj / M) y y, la muestra de x que toma
// cada flanco de subida de clko. clko cambia en los flancos de bajada de clk (cuando x, que cambia
// con los de subida, está quieta), así que los bloques que siguen con clko (los peines de un CIC)
// son sincrónicos con y: en cada flanco toman la muestra anterior.
module dsp_downsample #(parameter W = 16, parameter M = 8) (
  input clk,
  input signed [W-1:0] x,
  output reg signed [W-1:0] y,
  output reg clko
);
  reg [15:0] n;
  initial n = 0;
  initial y = 0;
  initial clko = 0;
  always @(negedge clk) begin
    n <= n == M - 1 ? 0 : n + 1;
    clko <= n < M / 2;
  end
  always @(posedge clko) y <= x;
endmodule
