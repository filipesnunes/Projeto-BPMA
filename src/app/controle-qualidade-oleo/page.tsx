import { OilWorkflowList, type OilQuery } from "./workflow-view";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<OilQuery>}) {return <OilWorkflowList query={await searchParams}/>;}
