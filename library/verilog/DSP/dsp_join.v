// Unir dos buses (#366): el byte alto y el bajo en una palabra de 16 bits.
module dsp_join (
  input [7:0] hi,
  input [7:0] lo,
  output [15:0] y
);
  assign y = {hi, lo};
endmodule
