// Mínimo y máximo (#366) de dos palabras con signo.
module dsp_minmax #(parameter W = 16) (
  input signed [W-1:0] a,
  input signed [W-1:0] b,
  output signed [W-1:0] mn,
  output signed [W-1:0] mx
);
  assign mn = a < b ? a : b;
  assign mx = a < b ? b : a;
endmodule
