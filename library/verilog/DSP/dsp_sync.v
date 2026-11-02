// Sincronizador de dos flip-flops (#366): pasa una señal asincrónica (un botón, otro dominio de reloj)
// al dominio de clk, con dos ciclos de retardo.
module dsp_sync (
  input clk,
  input d,
  output reg q
);
  reg m;
  initial m = 0;
  initial q = 0;
  always @(posedge clk) begin
    m <= d;
    q <= m;
  end
endmodule
