// Impulso (#366): VALUE durante el primer ciclo de reloj y 0 después (para ver la respuesta
// de un filtro). El escalón es otro bloque: dsp_step.
module dsp_impulse #(parameter W = 16, parameter VALUE = 16384) (
  input clk,
  output signed [W-1:0] y
);
  reg n0, n1;
  initial begin
    n0 = 0;
    n1 = 0;
  end
  always @(posedge clk) begin
    n0 <= 1;
    n1 <= n0;
  end
  assign y = n0 && !n1 ? VALUE : 0;
endmodule
