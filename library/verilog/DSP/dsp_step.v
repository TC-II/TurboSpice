// Escalón (#366): 0 hasta el primer flanco de reloj y VALUE desde ahí para siempre (para ver la
// respuesta al escalón de un filtro, un integrador…).
module dsp_step #(parameter W = 16, parameter VALUE = 16384) (
  input clk,
  output signed [W-1:0] y
);
  reg on;
  initial on = 0;
  always @(posedge clk) on <= 1;
  assign y = on ? VALUE : 0;
endmodule
