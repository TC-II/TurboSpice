// Comparador (#366) de dos palabras con signo: lt (a < b), eq (a = b) y gt (a > b).
module dsp_cmp #(parameter W = 16) (
  input signed [W-1:0] a,
  input signed [W-1:0] b,
  output lt,
  output eq,
  output gt
);
  assign lt = a < b;
  assign eq = a == b;
  assign gt = a > b;
endmodule
