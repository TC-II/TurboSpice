// 74HC00: NAND de 2 entradas (una de las cuatro del integrado).
module hc00 (input A, input B, output Y);
  assign Y = ~(A & B);
endmodule
