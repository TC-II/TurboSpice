// Máscara (#366): y = x AND MASK (MASK es el entero: 0x00FF = 255 deja el byte de abajo).
module dsp_mask #(parameter W = 16, parameter MASK = 255) (
  input [W-1:0] x,
  output [W-1:0] y
);
  localparam [W-1:0] M = MASK;
  assign y = x & M;
endmodule
