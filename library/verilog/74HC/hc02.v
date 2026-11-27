// 74HC02: NOR de 2 entradas (una de las cuatro del integrado).
module hc02 (input A, input B, output Y);
  assign Y = ~(A | B);
endmodule
