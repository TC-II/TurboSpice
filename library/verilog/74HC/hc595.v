// 74HC595: registro de desplazamiento de 8 bits (SER entra por QA en cada flanco de SRCLK) con un
// registro de salida que copia el de desplazamiento en el flanco de RCLK. SRCLR_n borra el de
// desplazamiento; con OE_n en 1, QA–QH quedan en Z. QHs (QH') es la salida serie, para encadenar otro.
module hc595 (input SER, input SRCLK, input SRCLR_n, input RCLK, input OE_n,
              output QA, output QB, output QC, output QD, output QE, output QF, output QG, output QH, output QHs);
  reg [7:0] sr, out;
  always @(posedge SRCLK or negedge SRCLR_n)
    if (!SRCLR_n) sr <= 8'd0;
    else sr <= {sr[6:0], SER};
  always @(posedge RCLK) out <= sr;
  assign {QH, QG, QF, QE, QD, QC, QB, QA} = OE_n ? 8'bz : out;
  assign QHs = sr[7];
endmodule
