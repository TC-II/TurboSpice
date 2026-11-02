// Impulso (#366): VALUE durante el primer ciclo de reloj y 0 después (para ver la respuesta
// de un filtro). Con STEP = 1 es un escalón: VALUE desde el primer flanco y para siempre.
module dsp_impulse #(parameter W = 16, parameter VALUE = 16384, parameter STEP = 0) (
  input clk,
  output signed [W-1:0] y
);
  reg [1:0] n;
  initial n = 0;
  always @(posedge clk) if (n != 2) n <= n + 1;
  assign y = n == 1 || (STEP != 0 && n == 2) ? VALUE : 0;
endmodule
