// Paridad (#366): p = 1 si x tiene una cantidad impar de unos.
module dsp_parity #(parameter W = 16) (
  input [W-1:0] x,
  output p
);
  assign p = ^x;
endmodule
