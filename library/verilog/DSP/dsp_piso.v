// Registro de desplazamiento paralelo → serie (#366): con load = 1 toma x en el flanco; si no,
// corre hacia arriba y sale el bit más alto por q (primero el MSB).
module dsp_piso #(parameter W = 16) (
  input clk,
  input load,
  input [W-1:0] x,
  output q
);
  reg [W-1:0] r;
  initial r = 0;
  always @(posedge clk) r <= load ? x : {r[W-2:0], 1'b0};
  assign q = r[W-1];
endmodule
