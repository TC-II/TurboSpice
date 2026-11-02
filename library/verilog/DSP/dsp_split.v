// Separar un bus (#366): la palabra de 16 bits en su byte alto y su byte bajo.
module dsp_split (
  input [15:0] x,
  output [7:0] hi,
  output [7:0] lo
);
  assign hi = x[15:8];
  assign lo = x[7:0];
endmodule
