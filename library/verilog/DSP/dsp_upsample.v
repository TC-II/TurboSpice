// Interpolador ↑L por inserción de ceros (#366): con el reloj rápido clk, toma x en el primero de
// cada L ciclos y da 0 en los otros L − 1 (después va un pasabajos). clko marca la frecuencia de x
// (f_reloj / L; cambia en los flancos de bajada de clk, como el de dsp_downsample) para generarla.
module dsp_upsample #(parameter W = 16, parameter L = 4) (
  input clk,
  input signed [W-1:0] x,
  output reg signed [W-1:0] y,
  output reg clko
);
  reg [15:0] n;
  initial n = 0;
  initial y = 0;
  initial clko = 0;
  always @(negedge clk) clko <= n < L / 2;
  always @(posedge clk) begin
    n <= n == L - 1 ? 0 : n + 1;
    y <= n == 0 ? x : 0;
  end
endmodule
