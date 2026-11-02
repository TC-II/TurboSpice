// Temporizador de un disparo (#366): un flanco de subida de trig pone q en 1 durante N ciclos de
// reloj (otro disparo mientras dura vuelve a empezar la cuenta).
module dsp_oneshot #(parameter N = 16) (
  input clk,
  input trig,
  output q
);
  reg [15:0] n;
  reg t1;
  initial n = 0;
  initial t1 = 0;
  always @(posedge clk) begin
    t1 <= trig;
    n <= trig & ~t1 ? N : n != 0 ? n - 1 : 0;
  end
  assign q = n != 0;
endmodule
