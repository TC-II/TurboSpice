// Registro de desplazamiento serie → paralelo (#366): en cada flanco entra d por el bit 0 y todo
// se corre un lugar hacia arriba. Arranca en 0.
module dsp_shiftreg #(parameter W = 16) (
  input clk,
  input d,
  output reg [W-1:0] q
);
  initial q = 0;
  always @(posedge clk) q <= {q[W-2:0], d};
endmodule
