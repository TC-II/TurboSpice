// 74HC08: AND de 2 entradas (una de las cuatro del integrado).
module hc08 (input A, input B, output Y);
  assign Y = A & B;
endmodule
