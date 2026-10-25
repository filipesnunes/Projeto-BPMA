import {GroupWorkflowList,type GroupQuery} from "@/components/group-workflow-list";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<GroupQuery>}) {return <GroupWorkflowList module="rastreabilidade" query={await searchParams} history/>;}
