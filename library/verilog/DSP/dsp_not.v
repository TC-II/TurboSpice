// NOT bit a bit (#366).
module dsp_not #(parameter W = 16) (
  input [W-1:0] x,
  output [W-1:0] y
);
  assign y = ~x;
endmodule
