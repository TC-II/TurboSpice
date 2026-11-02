// AND bit a bit de dos palabras (#366).
module dsp_and #(parameter W = 16) (
  input [W-1:0] a,
  input [W-1:0] b,
  output [W-1:0] y
);
  assign y = a & b;
endmodule
