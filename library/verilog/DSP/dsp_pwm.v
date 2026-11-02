// PWM (#366): período de 2^N ciclos de reloj; q vale 1 durante duty ciclos de cada período
// (duty sin signo, de N bits: 0 da siempre 0).
module dsp_pwm #(parameter N = 8) (
  input clk,
  input [N-1:0] duty,
  output q
);
  reg [N-1:0] n;
  initial n = 0;
  always @(posedge clk) n <= n + 1;
  assign q = n < duty;
endmodule
