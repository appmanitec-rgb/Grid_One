import { expect, test } from '@playwright/test';
import { apiLogin, apiRequest, apiRequestRaw, getE2eEntityData, loginByApi } from './helpers/auth';
import { accounts } from './helpers/test-data';

type Proposal = {id:string;code:string;totalValue:number;downPaymentAmount:number;downPaymentConfirmedAt?:string;paymentPlan:{preset:string;entryValue:number;balanceInstallments:number}};
type Receivable = {id:string;description:string;sourceProposalId?:string;proposalPaymentStage?:string;netAmount:number;paidAmount:number;payments:Array<{id:string;amount:number}>};

async function createProposal(preset:'50_50'|'30_70'|'CUSTOM'|'PREPAID',type='PARTS_AND_SERVICES') {
  const [data,admin,sales,customer,finance]=await Promise.all([getE2eEntityData(),apiLogin(accounts.admin),apiLogin(accounts.sales),apiLogin(accounts.clientA),apiLogin(accounts.finance)]);
  const generator=await apiRequest<{id:string;clientId:string}>(admin.access_token,'/generators/'+data.clientAEquipmentId);
  const catalog=await apiRequest<Array<{id:string;type:string;basePrice:number}>>(admin.access_token,'/catalogs');
  const item=catalog.find(item=>item.type==='SERVICE'&&Number(item.basePrice)>0)!;
  expect(item).toBeTruthy();
  const profiles=await apiRequest<Array<{id:string;purpose:string}>>(admin.access_token,'/proposals/payment-profiles');
  const profile=profiles.find(profile=>profile.purpose==='SERVICES')!;
  expect(profile).toBeTruthy();
  const proposal=await apiRequest<Proposal>(sales.access_token,'/proposals',{method:'POST',body:{
    clientId:generator.clientId,generatorId:generator.id,userId:(sales.user as {id:string}).id,type,
    servicesPaymentProfileId:profile.id,scope:'Teste de composição de pagamento e liberação financeira.',
    paymentTerm:preset==='CUSTOM'?'Entrada em valor e saldo parcelado':'Condição padrão',
    paymentPlan:{preset,entryType:preset==='CUSTOM'?'VALUE':'PERCENTAGE',entryValue:preset==='CUSTOM'?25:0,balanceInstallments:preset==='CUSTOM'?3:1},
    items:[{kind:'CATALOG_SERVICE',catalogItemId:item.id,quantity:2,unitPrice:item.basePrice}],
  }});
  await apiRequest(sales.access_token,'/proposals/'+proposal.id+'/submit-board',{method:'POST'});
  await apiRequest(admin.access_token,'/proposals/'+proposal.id+'/board-approve',{method:'POST'});
  await apiRequest(customer.access_token,'/customer-portal/proposals/'+proposal.id+'/approve',{method:'POST',body:{note:'Aceite do teste de entrada.'}});
  return {proposal,admin,sales,finance,generator};
}

test('50/50: cliente aprova, financeiro define datas e confirma a entrada antes da O.S.',async({page})=>{
  test.setTimeout(180_000);
  const {proposal,admin,sales,finance,generator}=await createProposal('50_50');
  expect(proposal.downPaymentAmount).toBeCloseTo(proposal.totalValue*0.5,2);
  expect(proposal.paymentPlan.entryValue).toBe(50);
  const orders=()=>apiRequest<Array<{id:string;sourceProposalId?:string}>>(admin.access_token,'/maintenance-orders?generatorId='+generator.id);
  expect((await orders()).filter(order=>order.sourceProposalId===proposal.id)).toHaveLength(0);
  const denied=await apiRequestRaw(sales.access_token,'/finance/receivables/proposals/'+proposal.id+'/schedule',{method:'POST',body:{dueDates:['2026-10-15','2026-11-15']}});
  expect(denied.status).toBe(403);

  await loginByApi(page,accounts.finance);
  await page.goto('/dashboard/finance/accounts-receivable',{timeout:60_000});
  const queue=page.getByRole('article',{name:'Pagamento da proposta '+proposal.code,exact:true});
  await expect(queue).toBeVisible({timeout:45_000});
  await queue.getByLabel('Vencimento de Entrada · '+proposal.code,{exact:true}).fill('2026-10-15');
  await queue.getByLabel('Vencimento de Parcela 1 de 1 · '+proposal.code,{exact:true}).fill('2026-11-15');
  await queue.getByRole('button',{name:'Gerar parcelas da proposta',exact:true}).click();
  await expect(queue.getByText('Aguardando entrada',{exact:true})).toBeVisible();
  const titles=(await apiRequest<Receivable[]>(finance.access_token,'/finance/receivables')).filter(row=>row.sourceProposalId===proposal.id);
  expect(titles).toHaveLength(2);
  expect(titles.reduce((sum,row)=>sum+Math.round(row.netAmount*100),0)).toBe(Math.round(proposal.totalValue*100));
  const duplicate=await apiRequest<{created:boolean}>(finance.access_token,'/finance/receivables/proposals/'+proposal.id+'/schedule',{method:'POST',body:{dueDates:['2026-10-15','2026-11-15']}});
  expect(duplicate.created).toBe(false);
  const entry=titles.find(row=>row.proposalPaymentStage==='DOWN_PAYMENT')!;
  const bank=(await apiRequest<Array<{id:string;isActive:boolean}>>(finance.access_token,'/finance/bank-accounts')).find(bank=>bank.isActive)!;
  const partial=Math.round(entry.netAmount*50)/100;
  await apiRequest(finance.access_token,'/finance/receivables/'+entry.id+'/pay',{method:'PATCH',body:{amount:partial,bankAccountId:bank.id,method:'PIX',notes:'Recebimento parcial de entrada E2E.'}});
  expect((await orders()).filter(order=>order.sourceProposalId===proposal.id)).toHaveLength(0);
  const before=await apiRequest<Proposal>(admin.access_token,'/proposals/'+proposal.id);
  expect(before.downPaymentConfirmedAt).toBeNull();

  await page.reload();
  const receipt=page.locator('article').filter({has:page.getByText(entry.description,{exact:true})});
  await receipt.getByRole('button',{name:'Registrar recebimento',exact:true}).click();
  await receipt.getByLabel('Conta destino',{exact:true}).selectOption(bank.id);
  await receipt.getByLabel('Metodo',{exact:true}).selectOption('PIX');
  await receipt.getByRole('button',{name:'Confirmar baixa',exact:true}).click();
  await expect(page.getByText('Recebimento registrado e titulo quitado.',{exact:true})).toBeVisible();
  const paid=await apiRequest<Proposal>(admin.access_token,'/proposals/'+proposal.id);
  expect(paid.downPaymentConfirmedAt).toBeTruthy();
  const released=(await orders()).filter(order=>order.sourceProposalId===proposal.id);
  expect(released).toHaveLength(1);
  const after=(await apiRequest<Receivable[]>(finance.access_token,'/finance/receivables')).find(row=>row.id===entry.id)!;
  const last=after.payments.find(payment=>Math.abs(payment.amount-(entry.netAmount-partial))<0.01)!;
  await apiRequest(finance.access_token,'/finance/receivables/'+entry.id+'/payments/'+last.id+'/reverse',{method:'PATCH',body:{reason:'Estorno para verificar bloqueio financeiro do teste.'}});
  expect((await apiRequest<Proposal>(admin.access_token,'/proposals/'+proposal.id)).downPaymentConfirmedAt).toBeNull();
  const blocked=await apiRequestRaw(admin.access_token,'/maintenance-orders/'+released[0].id,{method:'PATCH',body:{status:'IN_PROGRESS'}});
  expect(blocked.status).toBe(400);
  expect(await blocked.text()).toContain('confirmação da entrada');
  const reportBlocked=await apiRequestRaw(admin.access_token,'/maintenance-orders/'+released[0].id+'/visit-report/submit',{method:'POST',body:{report:'Relatorio de teste bloqueado por estorno.'}});
  expect(reportBlocked.status).toBe(400);
  expect(await reportBlocked.text()).toContain('confirmação da entrada');
});

test('30/70: contrato aguarda a entrada e mantém a primeira cobrança sem duplicar parcelas',async()=>{
  const {proposal,admin,finance}=await createProposal('30_70','CONTRACT');
  expect(proposal.downPaymentAmount).toBe(Math.round(proposal.totalValue*30)/100);
  const denied=await apiRequestRaw(admin.access_token,'/proposals/'+proposal.id+'/convert-contract',{method:'POST'});
  expect(denied.status).toBe(400);
  expect(await denied.text()).toContain('confirmação da entrada');
  const schedule=await apiRequest<{receivables:Receivable[]}>(finance.access_token,'/finance/receivables/proposals/'+proposal.id+'/schedule',{method:'POST',body:{dueDates:['2026-10-15','2026-11-15']}});
  const entry=schedule.receivables.find(row=>row.proposalPaymentStage==='DOWN_PAYMENT')!;
  const bank=(await apiRequest<Array<{id:string;isActive:boolean}>>(finance.access_token,'/finance/bank-accounts')).find(bank=>bank.isActive)!;
  await apiRequest(finance.access_token,'/finance/receivables/'+entry.id+'/pay',{method:'PATCH',body:{amount:entry.netAmount,bankAccountId:bank.id,method:'PIX'}});
  const converted=await apiRequest<{contract:{id:string}}>(admin.access_token,'/proposals/'+proposal.id+'/convert-contract',{method:'POST'});
  const contract=await apiRequest<{invoices:Array<{id:string;competenceDate:string;dueDate:string;status:string}>}>(admin.access_token,'/contracts/'+converted.contract.id);
  const first=[...contract.invoices].sort((a,b)=>a.competenceDate.localeCompare(b.competenceDate))[0];
  const period=(await apiRequest<Array<Receivable & {contractId:string;competenceDate:string}>>(finance.access_token,'/finance/receivables')).filter(row=>row.contractId===converted.contract.id&&row.competenceDate===first.competenceDate);
  expect(period).toHaveLength(2);
  expect(period.reduce((sum,row)=>sum+Math.round(row.netAmount*100),0)).toBe(Math.round(proposal.totalValue*100));
  expect(first.dueDate.slice(0,10)).toBe('2026-11-15');
  expect(first.status).not.toBe('PAID');
});

test('condição especial gera entrada em valor e três parcelas do saldo sem perder centavos',async()=>{
  const {proposal,finance}=await createProposal('CUSTOM');
  expect(proposal.downPaymentAmount).toBe(25);
  const response=await apiRequest<{receivables:Receivable[]}>(finance.access_token,'/finance/receivables/proposals/'+proposal.id+'/schedule',{method:'POST',body:{dueDates:['2026-10-15','2026-11-15','2026-12-15','2027-01-15']}});
  expect(response.receivables).toHaveLength(4);
  expect(response.receivables.reduce((sum,row)=>sum+Math.round(row.netAmount*100),0)).toBe(Math.round(proposal.totalValue*100));
});
