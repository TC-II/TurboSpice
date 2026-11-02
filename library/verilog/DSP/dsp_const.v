// Constante en complemento a dos (#366). VALUE es el entero: en Q1.15, 0,5 es 16384.
module dsp_const #(parameter W = 16, parameter VALUE = 0) (
  output signed [W-1:0] y
);
  assign y = VALUE;
endmodule
