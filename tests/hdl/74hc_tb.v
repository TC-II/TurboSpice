// La biblioteca 74HC (library/verilog/74HC) contra las tablas de las hojas de datos.
// Corre con tests/hdl/testbenches.mjs (Icarus, como «Correr testbench»).
`timescale 1ns/1ps
`define PULSO(c) begin #5 c = 1; #5 c = 0; end
module lib74hc_tb;
  integer errores = 0;
  integer i;
  task check(input [8*40-1:0] que, input [31:0] got, input [31:0] want);
    if (got !== want) begin
      $display("FAIL %0s: %h (esperaba %h)", que, got, want);
      errores = errores + 1;
    end
  endtask

  // --- compuertas: las cuatro combinaciones ---
  reg a, b;
  wire y00, y02, y04, y08, y32, y86, y125;
  reg oe_n;
  hc00 g00 (.A(a), .B(b), .Y(y00));
  hc02 g02 (.A(a), .B(b), .Y(y02));
  hc04 g04 (.A(a), .Y(y04));
  hc08 g08 (.A(a), .B(b), .Y(y08));
  hc32 g32 (.A(a), .B(b), .Y(y32));
  hc86 g86 (.A(a), .B(b), .Y(y86));
  hc125 g125 (.A(a), .OE_n(oe_n), .Y(y125));

  // --- 74: flip-flop D con preset y clear ---
  reg d, clk, pre_n, clr_n;
  wire q74, qn74;
  hc74 ff (.D(d), .CLK(clk), .PRE_n(pre_n), .CLR_n(clr_n), .Q(q74), .Q_n(qn74));

  // --- 138, 151, 157 ---
  reg [2:0] s;
  reg g1, g2a_n, g2b_n;
  wire [7:0] y138_n;
  hc138 dec (.A(s[0]), .B(s[1]), .C(s[2]), .G1(g1), .G2A_n(g2a_n), .G2B_n(g2b_n),
             .Y0_n(y138_n[0]), .Y1_n(y138_n[1]), .Y2_n(y138_n[2]), .Y3_n(y138_n[3]),
             .Y4_n(y138_n[4]), .Y5_n(y138_n[5]), .Y6_n(y138_n[6]), .Y7_n(y138_n[7]));
  reg [7:0] dm;
  reg g_n;
  wire y151, w151;
  hc151 mux8 (.D0(dm[0]), .D1(dm[1]), .D2(dm[2]), .D3(dm[3]), .D4(dm[4]), .D5(dm[5]), .D6(dm[6]), .D7(dm[7]),
              .A(s[0]), .B(s[1]), .C(s[2]), .G_n(g_n), .Y(y151), .W(w151));
  reg [3:0] ma, mb;
  reg sel;
  wire [3:0] y157;
  hc157 mux2 (.A1(ma[0]), .B1(mb[0]), .A2(ma[1]), .B2(mb[1]), .A3(ma[2]), .B3(mb[2]), .A4(ma[3]), .B4(mb[3]),
              .S(sel), .G_n(g_n), .Y1(y157[0]), .Y2(y157[1]), .Y3(y157[2]), .Y4(y157[3]));

  // --- 161 y 163: contadores ---
  reg cclk, cclr_n, load_n, enp, ent;
  reg [3:0] din;
  wire [3:0] q161, q163;
  wire rco161, rco163;
  hc161 c161 (.CLK(cclk), .CLR_n(cclr_n), .LOAD_n(load_n), .ENP(enp), .ENT(ent), .A(din[0]), .B(din[1]), .C(din[2]), .D(din[3]),
              .QA(q161[0]), .QB(q161[1]), .QC(q161[2]), .QD(q161[3]), .RCO(rco161));
  hc163 c163 (.CLK(cclk), .CLR_n(cclr_n), .LOAD_n(load_n), .ENP(enp), .ENT(ent), .A(din[0]), .B(din[1]), .C(din[2]), .D(din[3]),
              .QA(q163[0]), .QB(q163[1]), .QC(q163[2]), .QD(q163[3]), .RCO(rco163));

  // --- 595: registro de desplazamiento con latch de salida ---
  reg ser, srclk, srclr_n, rclk, soe_n;
  wire [7:0] q595;
  wire qhs;
  hc595 sr (.SER(ser), .SRCLK(srclk), .SRCLR_n(srclr_n), .RCLK(rclk), .OE_n(soe_n),
            .QA(q595[0]), .QB(q595[1]), .QC(q595[2]), .QD(q595[3]), .QE(q595[4]), .QF(q595[5]), .QG(q595[6]), .QH(q595[7]), .QHs(qhs));

  // --- 4511: BCD a 7 segmentos ---
  reg [3:0] bcd;
  reg le, bi_n, lt_n;
  wire [6:0] seg; // g f e d c b a
  hc4511 d7 (.A(bcd[0]), .B(bcd[1]), .C(bcd[2]), .D(bcd[3]), .LE(le), .BI_n(bi_n), .LT_n(lt_n),
             .seg_a(seg[0]), .seg_b(seg[1]), .seg_c(seg[2]), .seg_d(seg[3]), .seg_e(seg[4]), .seg_f(seg[5]), .seg_g(seg[6]));
  reg [6:0] digitos [0:15];


  initial begin
    $dumpvars(0, lib74hc_tb);
    // compuertas
    oe_n = 0;
    for (i = 0; i < 4; i = i + 1) begin
      {a, b} = i;
      #1;
      check("00", y00, !(a & b));
      check("02", y02, !(a | b));
      check("04", y04, !a);
      check("08", y08, a & b);
      check("32", y32, a | b);
      check("86", y86, a ^ b);
      check("125", y125, a);
    end
    oe_n = 1;
    #1 check("125 OE_n=1", y125 === 1'bz, 1);

    // 74: clear, preset, los dos (Q = Q_n = 1), y después D en el flanco
    clk = 0; d = 1; pre_n = 1; clr_n = 0;
    #1 check("74 clear", {q74, qn74}, 2'b01);
    clr_n = 1; pre_n = 0;
    #1 check("74 preset", {q74, qn74}, 2'b10);
    clr_n = 0;
    #1 check("74 preset y clear", {q74, qn74}, 2'b11);
    clr_n = 1; pre_n = 1; d = 0;
    `PULSO(clk)
    check("74 D=0", {q74, qn74}, 2'b01);
    d = 1;
    #1 check("74 sin flanco", q74, 0);
    `PULSO(clk)
    check("74 D=1", {q74, qn74}, 2'b10);

    // 138: cada dirección habilitado, y deshabilitado por cada entrada
    g1 = 1; g2a_n = 0; g2b_n = 0;
    for (i = 0; i < 8; i = i + 1) begin
      s = i;
      #1 check("138", y138_n, 8'hFF ^ (8'b1 << i));
    end
    g1 = 0; #1 check("138 G1=0", y138_n, 8'hFF);
    g1 = 1; g2a_n = 1; #1 check("138 G2A_n=1", y138_n, 8'hFF);
    g2a_n = 0; g2b_n = 1; #1 check("138 G2B_n=1", y138_n, 8'hFF);

    // 151 y 157
    dm = 8'b1011_0010; g_n = 0;
    for (i = 0; i < 8; i = i + 1) begin
      s = i;
      #1 check("151", {y151, w151}, {dm[i], !dm[i]});
    end
    g_n = 1; #1 check("151 G_n=1", {y151, w151}, 2'b01);
    ma = 4'b0101; mb = 4'b1100; g_n = 0;
    sel = 0; #1 check("157 S=0", y157, ma);
    sel = 1; #1 check("157 S=1", y157, mb);
    g_n = 1; #1 check("157 G_n=1", y157, 0);

    // 161 y 163: clear (asincrónico en el 161, sincrónico en el 163), cuenta, RCO, carga
    cclk = 0; load_n = 1; enp = 1; ent = 1; din = 4'd12; cclr_n = 0;
    #1 check("161 clear sin flanco", q161, 0);
    `PULSO(cclk)
    check("163 clear en el flanco", q163, 0);
    cclr_n = 1;
    for (i = 1; i <= 15; i = i + 1) begin
      `PULSO(cclk)
      check("161 cuenta", q161, i);
      check("163 cuenta", q163, i);
    end
    check("161 RCO en 15", {rco161, rco163}, 2'b11);
    ent = 0; #1 check("RCO con ENT=0", {rco161, rco163}, 2'b00);
    `PULSO(cclk)
    check("161 sin ENT no cuenta", q161, 15);
    ent = 1; enp = 0;
    `PULSO(cclk)
    check("161 sin ENP no cuenta", q161, 15);
    enp = 1;
    `PULSO(cclk)
    check("161 15 -> 0", q161, 0);
    load_n = 0;
    `PULSO(cclk)
    check("161 carga", q161, 12);
    check("163 carga", q163, 12);

    // 595: entra 1011_0001 (el primero queda en QH), no cambia la salida hasta RCLK; QHs; OE_n; SRCLR_n
    srclk = 0; rclk = 0; soe_n = 0; srclr_n = 0;
    #1 srclr_n = 1;
    `PULSO(rclk)
    check("595 borrado", q595, 0);
    for (i = 7; i >= 0; i = i - 1) begin
      ser = (8'b1011_0001 >> i) & 1;
      `PULSO(srclk)
    end
    check("595 sin RCLK", q595, 0);
    check("595 QHs", qhs, 1);
    `PULSO(rclk)
    check("595 RCLK", q595, 8'b1011_0001);
    soe_n = 1;
    #1 check("595 OE_n=1", q595 === 8'bz, 1);
    soe_n = 0; srclr_n = 0;
    #1 check("595 SRCLR_n no toca la salida", q595, 8'b1011_0001);
    `PULSO(rclk)
    check("595 SRCLR_n borra el registro", q595, 0);

    // 4511: los 16 códigos, el latch, LT_n y BI_n
    digitos[0] = 7'h3F; digitos[1] = 7'h06; digitos[2] = 7'h5B; digitos[3] = 7'h4F; digitos[4] = 7'h66;
    digitos[5] = 7'h6D; digitos[6] = 7'h7C; digitos[7] = 7'h07; digitos[8] = 7'h7F; digitos[9] = 7'h67;
    for (i = 10; i < 16; i = i + 1) digitos[i] = 0;
    le = 0; bi_n = 1; lt_n = 1;
    for (i = 0; i < 16; i = i + 1) begin
      bcd = i;
      #1 check("4511", seg, digitos[i]);
    end
    bcd = 3; #1 le = 1;
    bcd = 8; #1 check("4511 latch", seg, digitos[3]);
    bi_n = 0; #1 check("4511 BI_n", seg, 0);
    lt_n = 0; #1 check("4511 LT_n", seg, 7'h7F);

    if (errores) $fatal(1, "FAIL: %0d errores", errores);
    $display("PASS");
    $finish;
  end
endmodule
