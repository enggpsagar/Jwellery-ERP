import { PageBackHeader } from "@/components/shared/page-back-header"
import { KarigarCreateForm } from "@/components/karigars/karigar-create-form"


export default function NewKarigarPage(){

  return (

    <main className="space-y-6 p-6">


      <PageBackHeader
        title="Add Karigar"
        description="Create new jewellery artisan record"
        backHref="/karigars"
        backLabel="Back to Karigars"
      />


      <KarigarCreateForm />


    </main>

  )

}