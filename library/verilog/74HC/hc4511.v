// 74HC4511: decodificador BCD a 7 segmentos (cátodo común, segmentos activos en alto) con latch:
// con LE en 0 sigue a la entrada D C B A, con LE en 1 la retiene. LT_n en 0 prende todo, BI_n en 0
// apaga todo; de 10 a 15, apagado.
module hc4511 (input A, input B, input C, input D, input LE, input BI_n, input LT_n,
               output seg_a, output seg_b, output seg_c, output seg_d, output seg_e, output seg_f, output seg_g);
  reg [3:0] l;
  always @* if (!LE) l = {D, C, B, A};
  reg [6:0] s; // g f e d c b a
  always @*
    case (l)
      4'd0: s = 7'b0111111;
      4'd1: s = 7'b0000110;
      4'd2: s = 7'b1011011;
      4'd3: s = 7'b1001111;
      4'd4: s = 7'b1100110;
      4'd5: s = 7'b1101101;
      4'd6: s = 7'b1111100;
      4'd7: s = 7'b0000111;
      4'd8: s = 7'b1111111;
      4'd9: s = 7'b1100111;
      default: s = 7'b0000000;
    endcase
  assign {seg_g, seg_f, seg_e, seg_d, seg_c, seg_b, seg_a} = !LT_n ? 7'b1111111 : !BI_n ? 7'b0000000 : s;
endmodule
