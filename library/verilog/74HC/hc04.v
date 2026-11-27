// 74HC04: inversor (uno de los seis del integrado).
module hc04 (input A, output Y);
  assign Y = ~A;
endmodule
