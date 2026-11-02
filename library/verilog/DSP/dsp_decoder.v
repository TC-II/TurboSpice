// Decodificador 3 → 8 (#366): y tiene un solo 1, en el bit que dice sel (con en = 0, todo en 0).
module dsp_decoder (
  input [2:0] sel,
  input en,
  output [7:0] y
);
  assign y = en ? 8'b1 << sel : 8'b0;
endmodule
